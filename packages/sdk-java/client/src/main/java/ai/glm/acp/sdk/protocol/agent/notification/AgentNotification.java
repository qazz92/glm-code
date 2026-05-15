package ai.glm.acp.sdk.protocol.agent.notification;

import ai.glm.acp.sdk.protocol.jsonrpc.MethodMessage;

public class AgentNotification<P> extends MethodMessage<P> {
    public AgentNotification() {
    }

    public AgentNotification(String method, P params) {
        super(method, params);
    }
}
