package com.healthai.anomaly.dto;

public class DatasetInfoDto {
    private String datapath;      // tên dataset, vd "2Dgesture"
    private int[] shape;
    private String dtype;
    private int length;           // = số điểm (rows) trong file test
    private int dimension;        // = số chiều mỗi điểm (rowSize)
    private Double anomalyPercent; // null nếu không có file label

    public DatasetInfoDto() {}

    public DatasetInfoDto(String datapath, int[] shape, String dtype, int length, int dimension, Double anomalyPercent) {
        this.datapath = datapath;
        this.shape = shape;
        this.dtype = dtype;
        this.length = length;
        this.dimension = dimension;
        this.anomalyPercent = anomalyPercent;
    }

    public String getDatapath() { return datapath; }
    public void setDatapath(String datapath) { this.datapath = datapath; }

    public int[] getShape() { return shape; }
    public void setShape(int[] shape) { this.shape = shape; }

    public String getDtype() { return dtype; }
    public void setDtype(String dtype) { this.dtype = dtype; }

    public int getLength() { return length; }
    public void setLength(int length) { this.length = length; }

    public int getDimension() { return dimension; }
    public void setDimension(int dimension) { this.dimension = dimension; }

    public Double getAnomalyPercent() { return anomalyPercent; }
    public void setAnomalyPercent(Double anomalyPercent) { this.anomalyPercent = anomalyPercent; }
}
