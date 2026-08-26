package com.healthai.anomaly.service;

/**
 * Đại diện cho "API 4" - service bên ngoài chạy model AI và trả về kết quả dự đoán.
 * Hiện tại CHƯA có API 4 thật, dùng {@link MockPredictionService} làm giả lập.
 *
 * Khi có API 4 thật, chỉ cần viết thêm 1 class implement interface này (vd
 * RealPredictionService, gọi HTTP sang API 4 bằng RestTemplate), rồi đánh dấu
 * nó @Primary (hoặc xóa MockPredictionService) - phần còn lại của code
 * (EvaluationController) không cần sửa gì.
 */
public interface PredictionService {

    /**
     * Trả về mảng kết quả dự đoán của model cho 1 dataset, độ dài PHẢI bằng
     * {@code length} (số điểm trong file test/label tương ứng).
     *
     * Mỗi phần tử:
     *  - 0.0 hoặc 1.0: model có dự đoán, giá trị dự đoán tương ứng
     *  - null: model không đưa ra dự đoán cho điểm đó ("không đoán")
     */
    Double[] predict(String datasetName, int length);
}
