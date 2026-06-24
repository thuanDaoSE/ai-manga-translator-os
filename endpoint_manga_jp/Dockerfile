FROM nvidia/cuda:12.1.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y python3-pip python3-dev git
RUN ln -s /usr/bin/python3 /usr/bin/python

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN python -c "from transformers import AutoProcessor, AutoModelForCausalLM; AutoProcessor.from_pretrained('gigass03/PaddleOCR-VL-1.6-Manga-Finetuned', trust_remote_code=True); AutoModelForCausalLM.from_pretrained('gigass03/PaddleOCR-VL-1.6-Manga-Finetuned', trust_remote_code=True)"

COPY handler.py .

CMD ["python", "handler.py"]
