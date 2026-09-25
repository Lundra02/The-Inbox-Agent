import os
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from inbox_agent.agent import process_with_metadata
from inbox_agent.mock_data import public_catalog
from inbox_agent.scorecard import run_scorecard
from typing import Literal

load_dotenv()

BACKEND_API_URL = os.getenv("BACKEND_API_URL")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    customerPhone: str | None = None
    customerId: str | None = None
    channel: str = "messenger"
    externalUserId: str | None = None
    pageId: str | None = None
    message: str = Field(min_length=1, max_length=10000)
    conversationHistory: list[Any] = Field(default_factory=list)
    intakeContext: dict[str, Any] | None = None
    memory: dict[str, Any] = Field(default_factory=dict)

    @field_validator("message")
    @classmethod
    def require_text(cls, value):
        if not value.strip():
            raise ValueError("Message must not be blank")
        return value.strip()


class ChatResponse(BaseModel):
    replyEngine: str = "rules"
    replyFallbackReason: str | None = None
    stockCheck: dict[str, Any] | None = None
    reply: str
    structuredOutput: dict[str, Any] | None = None
    result: dict[str, Any]
    engine: str
    fallbackReason: str | None = None
    elapsedMs: int
    memory: dict[str, Any] = Field(default_factory=dict)


@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    output = process_with_metadata(request.message, memory=request.memory)
    return ChatResponse(reply=output["result"]["customerReply"], structuredOutput=output["result"], **output)


@app.get("/catalog")
def catalog():
    return public_catalog()


@app.get("/health")
def health():
    return {"status": "ok", "project": "The Inbox Agent"}


@app.post("/scorecard")
def scorecard(mode: Literal["rules", "hybrid"] = "rules"):
    return run_scorecard(mode)
