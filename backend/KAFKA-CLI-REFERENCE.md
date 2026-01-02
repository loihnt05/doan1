# Kafka CLI Quick Reference

## Container Prefix

All commands should be prefixed with:
```bash
docker exec backend-kafka-1 <command>
```

Or enter the container:
```bash
docker exec -it backend-kafka-1 bash
```

---

## Topics

### List Topics
```bash
kafka-topics --bootstrap-server localhost:29092 --list
```

### Create Topic
```bash
kafka-topics --bootstrap-server localhost:29092 \
  --create \
  --topic my-topic \
  --partitions 6 \
  --replication-factor 1 \
  --config retention.ms=604800000
```

### Describe Topic
```bash
kafka-topics --bootstrap-server localhost:29092 \
  --describe \
  --topic my-topic
```

### Delete Topic
```bash
kafka-topics --bootstrap-server localhost:29092 \
  --delete \
  --topic my-topic
```

### Alter Topic (add partitions)
```bash
kafka-topics --bootstrap-server localhost:29092 \
  --alter \
  --topic my-topic \
  --partitions 10
```

---

## Producers

### Console Producer
```bash
kafka-console-producer --bootstrap-server localhost:29092 \
  --topic my-topic
```

### Producer with Key
```bash
kafka-console-producer --bootstrap-server localhost:29092 \
  --topic my-topic \
  --property "parse.key=true" \
  --property "key.separator=:"
```

Then type:
```
key1:message1
key2:message2
```

### Producer from File
```bash
kafka-console-producer --bootstrap-server localhost:29092 \
  --topic my-topic < messages.txt
```

---

## Consumers

### Console Consumer (from beginning)
```bash
kafka-console-consumer --bootstrap-server localhost:29092 \
  --topic my-topic \
  --from-beginning
```

### Console Consumer (latest only)
```bash
kafka-console-consumer --bootstrap-server localhost:29092 \
  --topic my-topic
```

### Consumer with Key
```bash
kafka-console-consumer --bootstrap-server localhost:29092 \
  --topic my-topic \
  --property print.key=true \
  --property key.separator=" = " \
  --from-beginning
```

### Consumer with Timestamps
```bash
kafka-console-consumer --bootstrap-server localhost:29092 \
  --topic my-topic \
  --property print.timestamp=true \
  --from-beginning
```

### Consumer with Partition
```bash
kafka-console-consumer --bootstrap-server localhost:29092 \
  --topic my-topic \
  --partition 0 \
  --from-beginning
```

### Consumer with Max Messages
```bash
kafka-console-consumer --bootstrap-server localhost:29092 \
  --topic my-topic \
  --max-messages 10 \
  --from-beginning
```

---

## Consumer Groups

### List Consumer Groups
```bash
kafka-consumer-groups --bootstrap-server localhost:29092 --list
```

### Describe Consumer Group
```bash
kafka-consumer-groups --bootstrap-server localhost:29092 \
  --group my-group \
  --describe
```

### Delete Consumer Group
```bash
kafka-consumer-groups --bootstrap-server localhost:29092 \
  --group my-group \
  --delete
```

### Reset Offsets to Beginning
```bash
kafka-consumer-groups --bootstrap-server localhost:29092 \
  --group my-group \
  --topic my-topic \
  --reset-offsets \
  --to-earliest \
  --execute
```

### Reset Offsets to End
```bash
kafka-consumer-groups --bootstrap-server localhost:29092 \
  --group my-group \
  --topic my-topic \
  --reset-offsets \
  --to-latest \
  --execute
```

### Reset Offsets to Specific Offset
```bash
kafka-consumer-groups --bootstrap-server localhost:29092 \
  --group my-group \
  --topic my-topic:0 \
  --reset-offsets \
  --to-offset 100 \
  --execute
```

### Reset Offsets by Duration (e.g., 1 hour ago)
```bash
kafka-consumer-groups --bootstrap-server localhost:29092 \
  --group my-group \
  --topic my-topic \
  --reset-offsets \
  --to-datetime 2024-01-15T10:00:00.000 \
  --execute
```

### Reset Offsets by Time Period
```bash
kafka-consumer-groups --bootstrap-server localhost:29092 \
  --group my-group \
  --topic my-topic \
  --reset-offsets \
  --shift-by -100 \
  --execute
```

---

## Performance Testing

### Producer Performance Test
```bash
kafka-producer-perf-test --topic my-topic \
  --num-records 1000000 \
  --record-size 1024 \
  --throughput -1 \
  --producer-props bootstrap.servers=localhost:29092
```

### Consumer Performance Test
```bash
kafka-consumer-perf-test --broker-list localhost:29092 \
  --topic my-topic \
  --messages 1000000
```

---

## Configuration

### List Broker Configs
```bash
kafka-configs --bootstrap-server localhost:29092 \
  --describe \
  --entity-type brokers \
  --entity-name 1
```

### Alter Topic Config
```bash
kafka-configs --bootstrap-server localhost:29092 \
  --entity-type topics \
  --entity-name my-topic \
  --alter \
  --add-config retention.ms=86400000
```

---

## Debugging

### Check Broker Logs
```bash
docker logs backend-kafka-1 -f
```

### Check Zookeeper
```bash
docker exec backend-zookeeper-1 zkCli.sh ls /brokers/ids
```

### Verify Kafka is Running
```bash
docker exec backend-kafka-1 kafka-broker-api-versions \
  --bootstrap-server localhost:29092
```

### Count Messages in Topic
```bash
kafka-run-class kafka.tools.GetOffsetShell \
  --broker-list localhost:29092 \
  --topic my-topic \
  --time -1
```

---

## Useful Aliases

Add to your `~/.bashrc` or `~/.zshrc`:

```bash
# Kafka topic shortcuts
alias kt-list='docker exec backend-kafka-1 kafka-topics --bootstrap-server localhost:29092 --list'
alias kt-create='docker exec backend-kafka-1 kafka-topics --bootstrap-server localhost:29092 --create'
alias kt-describe='docker exec backend-kafka-1 kafka-topics --bootstrap-server localhost:29092 --describe'
alias kt-delete='docker exec backend-kafka-1 kafka-topics --bootstrap-server localhost:29092 --delete'

# Kafka consumer/producer shortcuts
alias kc-consume='docker exec -it backend-kafka-1 kafka-console-consumer --bootstrap-server localhost:29092'
alias kc-produce='docker exec -it backend-kafka-1 kafka-console-producer --bootstrap-server localhost:29092'

# Kafka consumer group shortcuts
alias kg-list='docker exec backend-kafka-1 kafka-consumer-groups --bootstrap-server localhost:29092 --list'
alias kg-describe='docker exec backend-kafka-1 kafka-consumer-groups --bootstrap-server localhost:29092 --describe'
alias kg-reset='docker exec backend-kafka-1 kafka-consumer-groups --bootstrap-server localhost:29092 --reset-offsets'
```

Usage:
```bash
kt-list
kt-create --topic my-topic --partitions 3
kc-consume --topic my-topic --from-beginning
kg-list
```

---

## Common Workflows

### Create Topic and Test
```bash
# 1. Create topic
kafka-topics --bootstrap-server localhost:29092 \
  --create --topic test --partitions 3

# 2. Produce messages
kafka-console-producer --bootstrap-server localhost:29092 \
  --topic test

# 3. Consume (in another terminal)
kafka-console-consumer --bootstrap-server localhost:29092 \
  --topic test --from-beginning
```

### Debug Consumer Lag
```bash
# 1. Check consumer group status
kafka-consumer-groups --bootstrap-server localhost:29092 \
  --group my-group --describe

# Look at LAG column:
# - LAG = 0: No backlog, consumer up to date
# - LAG > 0: Consumer behind, increase instances or optimize processing
```

### Replay Messages
```bash
# 1. Stop consumers

# 2. Reset offsets to beginning
kafka-consumer-groups --bootstrap-server localhost:29092 \
  --group my-group \
  --topic my-topic \
  --reset-offsets --to-earliest --execute

# 3. Restart consumers (will reprocess all messages)
```

### Monitor Topic Growth
```bash
# Check topic size over time
watch -n 1 'kafka-topics --bootstrap-server localhost:29092 \
  --describe --topic my-topic | grep PartitionCount'
```

---

## Kafka UI Alternative (Web Interface)

Instead of CLI, use Kafka UI:

```
http://localhost:8080
```

Features:
- Browse topics and messages
- View consumer groups and lag
- Create/delete topics
- Monitor broker health
- Search messages
- Visual partition distribution

---

## Troubleshooting

### Topic Not Found
```bash
# List all topics to verify name
kafka-topics --bootstrap-server localhost:29092 --list

# Check for typos or create topic
kafka-topics --bootstrap-server localhost:29092 \
  --create --topic correct-name --partitions 3
```

### Consumer Group Stuck
```bash
# Check status
kafka-consumer-groups --bootstrap-server localhost:29092 \
  --group my-group --describe

# If STATE = Dead, delete and recreate
kafka-consumer-groups --bootstrap-server localhost:29092 \
  --group my-group --delete
```

### High Lag
```bash
# Check consumer status
kafka-consumer-groups --bootstrap-server localhost:29092 \
  --group my-group --describe

# Solutions:
# 1. Scale consumers (match partition count)
# 2. Optimize processing logic
# 3. Increase resources
# 4. Check for errors in consumer logs
```

---

## References

- [Kafka Documentation](https://kafka.apache.org/documentation/)
- [Kafka UI](http://localhost:8080)
- [Project: PHASE4-MESSAGE-DISPATCHER.md](PHASE4-MESSAGE-DISPATCHER.md)
