package ai.glm.acp.sdk.protocol.client.response.terminal;

import ai.glm.acp.sdk.protocol.jsonrpc.Response;

import static ai.glm.acp.sdk.protocol.client.response.terminal.CreateTerminalResponse.CreateTerminalResponseResult;

public class CreateTerminalResponse extends Response<CreateTerminalResponseResult> {
    public static class CreateTerminalResponseResult {
        private String terminalId;

        // Getters and setters
        public String getTerminalId() {
            return terminalId;
        }

        public void setTerminalId(String terminalId) {
            this.terminalId = terminalId;
        }
    }
}
