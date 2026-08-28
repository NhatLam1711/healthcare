package com.healthai.anomaly.service;

/**
 * Đại diện cho "API 4" - (các) service bên ngoài chạy model AI và trả về kết
 * quả dự đoán. Hệ thống có thể có NHIỀU model khác nhau, chọn qua tham số
 * {@code modelId}. Hiện tại CHƯA có API 4 thật, dùng {@link MockPredictionService}
 * làm giả lập (random, chưa phân biệt theo modelId).
 *
 * Khi có API 4 thật, chỉ cần viết thêm 1 class implement interface này (vd
 * RealPredictionService, gọi HTTP sang service thật tương ứng với modelId
 * bằng RestTemplate), rồi đánh dấu nó @Primary (hoặc xóa MockPredictionService)
 * - phần còn lại của code (DatasetController) không cần sửa gì.
 */
public interface PredictionService {

    /**
     * Trả về mảng kết quả dự đoán của 1 model cụ thể cho 1 dataset, độ dài
     * PHẢI bằng {@code length} (số điểm trong file test/label tương ứng).
     *
     * @param datasetName tên dataset (vd "2DGesture")
     * @param modelId     model được chọn để dự đoán (vd "isolation-forest-v1")
     * @param length      số điểm cần dự đoán
     *
     * Mỗi phần tử trả về:
     *  - 0.0 hoặc 1.0: model có dự đoán, giá trị dự đoán tương ứng
     *  - null: model không đưa ra dự đoán cho điểm đó ("không đoán")
     */
    Double[] predict(String datasetName, String modelId, int length);
}
