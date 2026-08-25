package com.healthai.anomaly.dto;

/**
 * 1 điểm dữ liệu trong stream.
 * "values" tổng quát cho mọi số chiều: [x, y] nếu 2 chiều, [v1..v5] nếu 5 chiều, v.v.
 */
public class NpyPointDto {
    private int index;
    private double[] values;

    public NpyPointDto() {}

    public NpyPointDto(int index, double[] values) {
        this.index = index;
        this.values = values;
    }

    public int getIndex() { return index; }
    public void setIndex(int index) { this.index = index; }

    public double[] getValues() { return values; }
    public void setValues(double[] values) { this.values = values; }
}
