FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 9000

CMD ["python", "-m", "uvicorn", "api:app", "--host", "0.0.0.0", "--port", "9000"]
