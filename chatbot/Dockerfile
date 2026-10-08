# Build context is the repo root, because this image needs both the chatbot
# and the MCP server it launches as a subprocess.
FROM python:3.12-slim
WORKDIR /app
COPY chatbot/requirements.txt ./chatbot/
COPY mcp-server/requirements.txt ./mcp-server/
RUN pip install --no-cache-dir -r chatbot/requirements.txt -r mcp-server/requirements.txt
COPY mcp-server/ ./mcp-server/
COPY chatbot/ ./chatbot/
ENV MCP_SERVER_PATH=/app/mcp-server/server.py
WORKDIR /app/chatbot
EXPOSE 5001
CMD ["python", "app.py"]
