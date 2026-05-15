package ai.glm.acp.sdk.protocol.client.response.terminal;

import ai.glm.acp.sdk.protocol.jsonrpc.Response;

import static ai.glm.acp.sdk.protocol.client.response.terminal.ReleaseTerminalResponse.ReleaseTerminalResponseResult;

public class ReleaseTerminalResponse extends Response<ReleaseTerminalResponseResult> {
    public static class ReleaseTerminalResponseResult {
        // Empty result class as per schema
    }
}
