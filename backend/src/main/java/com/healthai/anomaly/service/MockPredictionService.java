package com.healthai.anomaly.service;

import org.springframework.stereotype.Service;

import java.util.Random;

/**
 * MOCK cho API 4 - CHƯA có model AI thật, tạm sinh kết quả dự đoán ngẫu nhiên
 * để có dữ liệu chạy thử API evaluate. Hiện CHƯA phân biệt hành vi theo
 * modelId (mọi model đều random như nhau) - khi có nhiều model thật, có thể
 * dispatch theo modelId trong hàm predict() bên dưới, hoặc thay hẳn class
 * này bằng 1 implementation gọi service thật.
 *
 * XÓA class này (hoặc comment @Service) khi đã có API 4 thật.
 */
@Service
public class MockPredictionService implements PredictionService {

    private final Random random = new Random();

    @Override
    public Double[] predict(String datasetName, String modelId, int length) {
        Double[] predictions = new Double[length];
        for (int i = 0; i < length; i++) {
            double r = random.nextDouble();
            if (r < 0.05) {
                predictions[i] = null; // ~5% giả lập trường hợp model "không đoán"
            } else {
                predictions[i] = random.nextInt(2) == 0 ? 0.0 : 1.0; // đoán ngẫu nhiên 0/1
            }
        }
        return predictions;
    }
}
