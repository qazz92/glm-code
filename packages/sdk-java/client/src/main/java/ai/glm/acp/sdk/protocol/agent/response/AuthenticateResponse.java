package ai.glm.acp.sdk.protocol.agent.response;

import ai.glm.acp.sdk.protocol.jsonrpc.Response;

import static ai.glm.acp.sdk.protocol.agent.response.AuthenticateResponse.AuthenticateResponseResult;

public class AuthenticateResponse extends Response<AuthenticateResponseResult> {
    public static class AuthenticateResponseResult {
        // Empty result class as per schema
    }
}
