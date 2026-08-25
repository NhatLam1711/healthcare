package com.healthai.anomaly.npy;

/**
 * Kết quả parse 1 file .npy.
 * - shape: shape gốc của mảng numpy, ví dụ [8451, 2] hoặc [2800] hoặc [1000, 5]
 * - rows:  dữ liệu đã "duỗi" thành từng dòng (row-major). Mỗi dòng là 1 double[]
 *          có độ dài = tích các chiều còn lại sau chiều đầu tiên (rowSize).
 *          Ví dụ shape (8451, 2) -> 8451 rows, mỗi row có 2 phần tử (x, y).
 *          Shape (2800,)         -> 2800 rows, mỗi row có 1 phần tử.
 *          Shape (100, 3, 4)     -> 100 rows, mỗi row có 12 phần tử (3*4, đã duỗi phẳng).
 */
public class NpyArray {
    private final int[] shape;
    private final String dtype;
    private final double[][] rows;

    public NpyArray(int[] shape, String dtype, double[][] rows) {
        this.shape = shape;
        this.dtype = dtype;
        this.rows = rows;
    }

    public int[] getShape() { return shape; }
    public String getDtype() { return dtype; }
    public double[][] getRows() { return rows; }
    public int numRows() { return rows.length; }
    public int rowSize() { return rows.length == 0 ? 0 : rows[0].length; }
}
