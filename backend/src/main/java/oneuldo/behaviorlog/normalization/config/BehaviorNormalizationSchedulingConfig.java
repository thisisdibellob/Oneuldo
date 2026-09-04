package oneuldo.behaviorlog.normalization.config;

import java.util.concurrent.Executor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Slf4j
@Configuration
@EnableAsync
@EnableScheduling
public class BehaviorNormalizationSchedulingConfig {

    @Bean(name = "behaviorNormalizationExecutor")
    public Executor behaviorNormalizationExecutor(
            @Value("${behavior-log.normalization.executor.core-pool-size:2}") int corePoolSize,
            @Value("${behavior-log.normalization.executor.max-pool-size:4}") int maxPoolSize,
            @Value("${behavior-log.normalization.executor.queue-capacity:1000}") int queueCapacity
    ) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(corePoolSize);
        executor.setMaxPoolSize(maxPoolSize);
        executor.setQueueCapacity(queueCapacity);
        executor.setThreadNamePrefix("behavior-normalizer-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(10);
        executor.setRejectedExecutionHandler((task, pool) -> log.warn(
                "행동 로그 정규화 실행 큐가 가득 찼습니다. 복구 작업에서 다시 처리합니다."
        ));
        executor.initialize();
        return executor;
    }
}
