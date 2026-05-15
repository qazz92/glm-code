"""Error types for glm_code_sdk."""

from __future__ import annotations


class GLMSDKError(Exception):
    """Base error for all SDK failures."""


class ValidationError(GLMSDKError):
    """Raised when query options are invalid."""


class AbortError(GLMSDKError):
    """Raised when an operation is aborted by caller or transport."""


class ProcessExitError(GLMSDKError):
    """Raised when glm CLI exits with non-zero status or signal."""

    def __init__(self, message: str, exit_code: int | None = None) -> None:
        super().__init__(message)
        self.exit_code = exit_code


class ControlRequestTimeoutError(GLMSDKError):
    """Raised when a control request times out waiting for response."""
