// Function to generate a constant distinct color for each feature index
export const getFeatureColor = (index) => {
    const hue = (index * 137.508) % 360;
    return `hsl(${hue}, 70%, 45%)`;
};
