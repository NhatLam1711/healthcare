package com.healthai.anomaly.dto;

/**
 * 1 điểm dữ liệu trong stream.
 * "values" tổng quát cho mọi số chiều: [x, y] nếu 2 chiều, [v1..v5] nếu 5 chiều, v.v.
 * "accuracy" (nullable): kết quả so sánh model AI (API 4) với label thật tại
 * đúng index này, tính song song ngay khi phát điểm - không cần pha riêng.
 * "Không đoán" (model không trả giá trị) được coi như dự đoán = 0.
 *   null = dataset chưa có label để so sánh (hoặc độ dài không khớp)
 *   0    = label=0, predicted=0  (đúng - bình thường)
 *   1    = label=1, predicted=1  (đúng - phát hiện đúng bất thường)
 *   2    = label=1, predicted=0  (sai - bỏ sót bất thường)
 *   3    = label=0, predicted=1  (sai - báo động giả)
 */
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
