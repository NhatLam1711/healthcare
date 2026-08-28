package com.healthai.anomaly.controller;

import com.healthai.anomaly.dto.DatasetInfoDto;
import com.healthai.anomaly.dto.NpyPointDto;
import com.healthai.anomaly.npy.NpyArray;
import com.healthai.anomaly.service.PredictionService;
import com.healthai.anomaly.service.RemoteDatasetService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;

import java.time.Duration;
import java.util.function.IntFunction;

/**
 * 3 API chính:
 *
 * API 1 - GET /api/v1/dataset/{name}/info
 *   Thông tin dataset (dimension, length, %anomaly), đọc trực tiếp từ file
 *   .npy trên Google Drive (link cấu hình sẵn trong application.yml theo
 *   tên dataset).
 *
 * API 2 - GET /api/v1/dataset/{name}/stream
 *   Stream dữ liệu thô (SSE, event "point"): mỗi điểm chỉ gồm index + values.
 *
 * API 3 - GET /api/v1/dataset/{name}/evaluate?model={modelId}
 *   Giống API 2 nhưng có thêm so sánh với 1 model AI cụ thể (bắt buộc chọn
 *   qua tham số "model", vì hệ thống có thể có nhiều model). Mỗi điểm gồm
 *   index + values + accuracy (so với model đã chọn).
 *   accuracy ("không đoán" coi như dự đoán = 0):
 *     null = dataset chưa có label để so sánh (hoặc độ dài không khớp)
 *     0    = label=0, predicted=0  (đúng - bình thường)
 *     1    = label=1, predicted=1  (đúng - phát hiện đúng bất thường)
 *     2    = label=1, predicted=0  (sai - bỏ sót bất thường)
 *     3    = label=0, predicted=1  (sai - báo động giả)
 *
 *   API 4 (service model AI thật) CHƯA có - xem PredictionService/MockPredictionService.
 */
@RestController
@RequestMapping("/api/v1/dataset")
public class DatasetController {

    private final RemoteDatasetService datasetService;
    private final PredictionService predictionService;

    public DatasetController(RemoteDatasetService datasetService, PredictionService predictionService) {
        this.datasetService = datasetService;
        this.predictionService = predictionService;
    }

    @GetMapping("/{name}/info")
    public DatasetInfoDto info(
            @PathVariable String name,
            @RequestParam(defaultValue = "false") boolean refresh
    ) {
        NpyArray data = fetchDataOrThrow(name, refresh);
        NpyArray label = datasetService.getLabel(name, refresh); // có thể null

        Double anomalyPercent = (label != null) ? computeAnomalyPercent(label) : null;

        return new DatasetInfoDto(
                name,
                data.getShape(),
                data.getDtype(),
                data.numRows(),
                data.rowSize(),
                anomalyPercent
        );
    }

    @GetMapping(value = "/{name}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<NpyPointDto>> stream(
            @PathVariable String name,
            @RequestParam(defaultValue = "20") long intervalMs,
            @RequestParam(defaultValue = "false") boolean refresh,
            @RequestParam(defaultValue = "20000") long maxDurationMs
    ) {
        NpyArray data = fetchDataOrThrow(name, refresh);
        // API 2: chỉ có index + values, không so sánh gì cả -> accuracy luôn null
        return buildStream(data, intervalMs, maxDurationMs, i -> null);
    }

    @GetMapping(value = "/{name}/evaluate", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<NpyPointDto>> evaluate(
            @PathVariable String name,
            @RequestParam String model,
            @RequestParam(defaultValue = "20") long intervalMs,
            @RequestParam(defaultValue = "false") boolean refresh,
            @RequestParam(defaultValue = "20000") long maxDurationMs
    ) {
        if (model == null || model.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Thiếu tham số 'model' - cần chọn model để so sánh (vd ?model=isolation-forest-v1)");
        }

        NpyArray data = fetchDataOrThrow(name, refresh);
        int totalRows = data.numRows();

        NpyArray label = safeGetLabel(name, refresh);
        Double[] predictions = null;
        boolean canCompare = false;
        if (label != null && label.numRows() == totalRows) {
            predictions = predictionService.predict(name, model, totalRows); // API 4 (mock)
            canCompare = predictions.length == totalRows;
        }
        final NpyArray labelFinal = label;
        final Double[] predictionsFinal = predictions;
        final boolean canCompareFinal = canCompare;

        return buildStream(data, intervalMs, maxDurationMs,
                i -> computeAccuracy(i, labelFinal, predictionsFinal, canCompareFinal));
    }

    /**
     * Xây luồng SSE chung cho cả API 2 và API 3: downsample theo maxDurationMs,
     * phát từng điểm cách nhau intervalMs, áp dụng accuracyFn để tính (hoặc
     * bỏ qua, trả null) trường accuracy cho từng điểm.
     */
    private Flux<ServerSentEvent<NpyPointDto>> buildStream(
            NpyArray data, long intervalMs, long maxDurationMs, IntFunction<Integer> accuracyFn
    ) {
        int totalRows = data.numRows();
        if (totalRows == 0) {
            return Flux.just(ServerSentEvent.<NpyPointDto>builder().event("complete").data(new NpyPointDto()).build());
        }

        // 1. Tính số điểm tối đa được phép phát trong maxDurationMs
        long maxPointsAllowed = Math.max(1, maxDurationMs / intervalMs);

        // 2. Tính bước nhảy (step): Nếu 2800 dòng và chỉ cho phát 1500 điểm -> step = 2
        int step = (int) Math.ceil((double) totalRows / maxPointsAllowed);

        Flux<ServerSentEvent<NpyPointDto>> points = Flux.range(0, (totalRows + step - 1) / step)
                .map(k -> k * step) // Chỉ số dòng thực tế: 0, step, 2*step, ...
                .filter(i -> i < totalRows)
                .delayElements(Duration.ofMillis(intervalMs))
                .map(i -> {
                    Integer accuracy = accuracyFn.apply(i);
                    NpyPointDto dto = new NpyPointDto(i, data.getRows()[i], accuracy);
                    return ServerSentEvent.<NpyPointDto>builder(dto)
                            .id(String.valueOf(i))
                            .event("point")
                            .build();
                });

        ServerSentEvent<NpyPointDto> completeEvent = ServerSentEvent.<NpyPointDto>builder()
                .event("complete")
                .data(new NpyPointDto())
                .build();

        return Flux.concat(points, Flux.just(completeEvent));
    }

    private Integer computeAccuracy(int i, NpyArray label, Double[] predictions, boolean canCompare) {
        if (!canCompare) return null;

        double[] labelRow = label.getRows()[i];
        double labelValue = labelRow[labelRow.length - 1];
        Double predictedRaw = predictions[i];
        // "Không đoán" (predicted = null) được coi như dự đoán = 0
        double predicted = (predictedRaw == null) ? 0.0 : predictedRaw;

        boolean labelPositive = labelValue == 1.0;
        boolean predPositive = predicted == 1.0;

        if (!labelPositive && !predPositive) return 0; // label=0, predicted=0
        if (labelPositive && predPositive) return 1;   // label=1, predicted=1
        if (labelPositive) return 2;                    // label=1, predicted=0 (bỏ sót)
        return 3;                                        // label=0, predicted=1 (báo động giả)
    }

    /** Lấy label nếu có; lỗi (dataset sai tên, tải Drive lỗi...) thì coi như không có label thay vì làm hỏng cả stream. */
    private NpyArray safeGetLabel(String name, boolean refresh) {
        try {
            return datasetService.getLabel(name, refresh);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return null;
        }
    }

    private NpyArray fetchDataOrThrow(String name, boolean refresh) {
        try {
            NpyArray data = datasetService.getData(name, refresh);
            if (data == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Dataset '" + name + "' chưa cấu hình data-url");
            }
            return data;
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
        } catch (IllegalStateException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, e.getMessage());
        }
    }

    /**
     * %anomaly = Sum(nhãn == 1) / (Sum(nhãn == 1) + Sum(nhãn == 0)) * 100
     * Lấy giá trị ở CỘT CUỐI CÙNG của mỗi dòng trong file label
     * (tổng quát: nếu label chỉ có 1 cột thì đó luôn là cột cuối).
     */
    private double computeAnomalyPercent(NpyArray label) {
        long ones = 0;
        long zeros = 0;
        for (double[] row : label.getRows()) {
            double v = row[row.length - 1];
            if (v == 1.0) ones++;
            else if (v == 0.0) zeros++;
        }
        long total = ones + zeros;
        return total == 0 ? 0.0 : (ones * 100.0) / total;
    }
}
