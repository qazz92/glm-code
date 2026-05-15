package ai.glm.acp.sdk.protocol.client.response;

import ai.glm.acp.sdk.protocol.domain.permission.RequestPermissionOutcome;
import ai.glm.acp.sdk.protocol.jsonrpc.Error;
import ai.glm.acp.sdk.protocol.jsonrpc.Response;

import static ai.glm.acp.sdk.protocol.client.response.RequestPermissionResponse.RequestPermissionResponseResult;

public class RequestPermissionResponse extends Response<RequestPermissionResponseResult> {
    public RequestPermissionResponse() {
    }

    public RequestPermissionResponse(Object id, RequestPermissionResponseResult result) {
        super(id, result);
    }

    public RequestPermissionResponse(Object id, Error error) {
        super(id, error);
    }

    public static class RequestPermissionResponseResult {
        private RequestPermissionOutcome outcome;

        public RequestPermissionResponseResult() {
        }

        public RequestPermissionResponseResult(RequestPermissionOutcome outcome) {
            this.outcome = outcome;
        }

        // Getters and setters
        public RequestPermissionOutcome getOutcome() {
            return outcome;
        }

        public void setOutcome(RequestPermissionOutcome outcome) {
            this.outcome = outcome;
        }
    }
}
