package ai.glm.acp.sdk.protocol.agent.response;

import ai.glm.acp.sdk.protocol.domain.session.SessionModeState;
import ai.glm.acp.sdk.protocol.jsonrpc.Response;

import static ai.glm.acp.sdk.protocol.agent.response.LoadSessionResponse.LoadSessionResponseResult;

public class LoadSessionResponse extends Response<LoadSessionResponseResult> {
    public static class LoadSessionResponseResult {
        private SessionModeState modes;

        // Getters and setters
        public SessionModeState getModes() {
            return modes;
        }

        public void setModes(SessionModeState modes) {
            this.modes = modes;
        }
    }
}
