FROM alpine:3.21

RUN apk add --no-cache bash ca-certificates postgresql16-client rclone

COPY keeper.sh /keeper.sh
RUN chmod +x /keeper.sh

CMD ["/keeper.sh"]
