package ai.glm.code.cli;

import java.util.List;

import ai.glm.code.cli.transport.TransportOptions;

import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import static org.junit.jupiter.api.Assertions.*;

class GLMCodeCliTest {

    private static final Logger log = LoggerFactory.getLogger(GLMCodeCliTest.class);
    @Test
    void simpleQuery() {
        List<String> result = GLMCodeCli.simpleQuery("hello world");
        log.info("simpleQuery result: {}", result);
        assertNotNull(result);
    }

    @Test
    void simpleQueryWithModel() {
        List<String> result = GLMCodeCli.simpleQuery("hello world", new TransportOptions().setModel("glm-plus"));
        log.info("simpleQueryWithModel result: {}", result);
        assertNotNull(result);
    }
}
