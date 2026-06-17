FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ibapi is bundled inside ib_insync — link it so runner scripts can import it directly
RUN python -c "import ib_insync, pathlib; \
    src = pathlib.Path(ib_insync.__file__).parent / 'ibapi'; \
    dst = pathlib.Path('/usr/local/lib').glob('python3*/site-packages/ibapi'); \
    [d.unlink() for d in dst if d.is_symlink()]; \
    import site, os; sp = site.getsitepackages()[0]; \
    os.symlink(str(src), os.path.join(sp, 'ibapi'))" || true

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
