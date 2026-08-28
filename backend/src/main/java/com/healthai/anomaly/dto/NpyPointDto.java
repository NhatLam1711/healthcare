package com.healthai.anomaly.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * 1 điểm dữ liệu trong stream. Dùng chung cho cả 2 API:
 *  - API 2 (/stream): chỉ có index + values, accuracy luôn null (ẩn khỏi JSON)
 *  - API 3 (/evaluate): có thêm accuracy so với model đã chọn
 *
 * "values" tổng quát cho mọi số chiều: [x, y] nếu 2 chiều, [v1..v5] nếu 5 chiều, v.v.
 * "accuracy" (nullable, ẩn khỏi JSON nếu null): kết quả so sánh model AI với
 * label thật tại đúng index này. "Không đoán" được coi như dự đoán = 0.
 *   null = không áp dụng (API 2, hoặc dataset/model chưa so sánh được)
 *   0    = label=0, predicted=0  (đúng - bình thường)
 *   1    = label=1, predicted=1  (đúng - phát hiện đúng bất thường)
 *   2    = label=1, predicted=0  (sai - bỏ sót bất thường)
 *   3    = label=0, predicted=1  (sai - báo động giả)
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class NpyPointDto {
    private int index;
    private double[] values;
    private Integer accuracy;

    public NpyPointDto() {}

    public NpyPointDto(int index, double[] values, Integer accuracy) {
        this.index = index;
        this.values = values;
        this.accuracy = accuracy;
    }

    public int getIndex() { return index; }
    public void setIndex(int index) { this.index = index; }

    public double[] getValues() { return values; }
    public void setValues(double[] values) { this.values = values; }

    public Integer getAccuracy() { return accuracy; }
    public void setAccuracy(Integer accuracy) { this.accuracy = accuracy; }
}
