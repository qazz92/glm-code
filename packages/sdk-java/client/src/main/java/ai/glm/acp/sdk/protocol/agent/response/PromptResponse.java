package ai.glm.acp.sdk.protocol.agent.response;

import ai.glm.acp.sdk.protocol.domain.session.StopReason;
import ai.glm.acp.sdk.protocol.jsonrpc.Response;

import static ai.glm.acp.sdk.protocol.agent.response.PromptResponse.PromptResponseResult;

public class PromptResponse extends Response<PromptResponseResult> {
    public static class PromptResponseResult {
        private StopReason stopReason;

        // Getters and setters
        public StopReason getStopReason() {
            return stopReason;
        }

        public void setStopReason(StopReason stopReason) {
            this.stopReason = stopReason;
        }
    }
}
