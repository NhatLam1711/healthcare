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

/**
 * 2 API chính:
 *
 * API 1 - GET /api/v1/dataset/{name}/info
 *   Trả về thông tin dataset (dimension, length, %anomaly) đọc trực tiếp từ
 *   file .npy trên Google Drive (link cấu hình sẵn trong application.yml
 *   theo tên dataset - client chỉ cần truyền {name}, không cần biết link thật).
 *
 * API 2 - GET /api/v1/dataset/{name}/stream
 *   Stream 1 lần duy nhất (SSE, event "point"): mỗi điểm gồm cả tọa độ dữ
 *   liệu thô (values) VÀ kết quả so sánh với model AI (accuracy) - tính
 *   song song ngay khi phát, không tách 2 pha riêng (tránh chạy gấp đôi
 *   thời gian). Kết thúc gửi 1 event "complete".
 *
 *   accuracy so sánh nhãn thật (label) với kết quả model dự đoán
 *   (API 4 - hiện đang MOCK, xem PredictionService/MockPredictionService).
 *   "Không đoán" (predicted = null) được coi như dự đoán = 0:
 *     null = dataset chưa có label để so sánh (hoặc độ dài không khớp)
 *     0    = label=0, predicted=0  (đúng - bình thường)
 *     1    = label=1, predicted=1  (đúng - phát hiện đúng bất thường)
 *     2    = label=1, predicted=0  (sai - bỏ sót bất thường)
 *     3    = label=0, predicted=1  (sai - báo động giả)
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
        int totalRows = data.numRows();

        if (totalRows == 0) {
            return Flux.just(ServerSentEvent.<NpyPointDto>builder().event("complete").build());
        }

        // Chuẩn bị dữ liệu so sánh (label + kết quả "API 4") 1 LẦN trước khi
        // stream, để lúc phát từng điểm chỉ cần tra cứu, không tốn thêm thời gian.
        NpyArray label = safeGetLabel(name, refresh);
        Double[] predictions = null;
        boolean canCompare = false;
        if (label != null && label.numRows() == totalRows) {
            predictions = predictionService.predict(name, totalRows); // API 4 (mock)
            canCompare = predictions.length == totalRows;
        }
        final NpyArray labelFinal = label;
        final Double[] predictionsFinal = predictions;
        final boolean canCompareFinal = canCompare;

        // 1. Tính số điểm tối đa được phép phát trong maxDurationMs
        long maxPointsAllowed = Math.max(1, maxDurationMs / intervalMs);

        // 2. Tính bước nhảy (step): Nếu 2800 dòng và chỉ cho phát 1500 điểm -> step = 2
        int step = (int) Math.ceil((double) totalRows / maxPointsAllowed);

        Flux<ServerSentEvent<NpyPointDto>> points = Flux.range(0, (totalRows + step - 1) / step)
                .map(k -> k * step) // Chỉ số dòng thực tế: 0, step, 2*step, ...
                .filter(i -> i < totalRows)
                .delayElements(Duration.ofMillis(intervalMs))
                .map(i -> {
                    Integer accuracy = null;
                    if (canCompareFinal) {
                        double[] labelRow = labelFinal.getRows()[i];
                        double labelValue = labelRow[labelRow.length - 1];
                        Double predictedRaw = predictionsFinal[i];
                        // "Không đoán" (predicted = null) được coi như dự đoán = 0
                        double predicted = (predictedRaw == null) ? 0.0 : predictedRaw;

                        boolean labelPositive = labelValue == 1.0;
                        boolean predPositive = predicted == 1.0;

                        if (!labelPositive && !predPositive) {
                            accuracy = 0; // label=0, predicted=0
                        } else if (labelPositive && predPositive) {
                            accuracy = 1; // label=1, predicted=1
                        } else if (labelPositive) {
                            accuracy = 2; // label=1, predicted=0 (bỏ sót)
                        } else {
                            accuracy = 3; // label=0, predicted=1 (báo động giả)
                        }
                    }

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
