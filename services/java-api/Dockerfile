FROM eclipse-temurin:21.0.4_7-jdk-alpine AS build
WORKDIR /build
# Wrapper and pom first so dependency download is cached until they change.
COPY mvnw pom.xml ./
COPY .mvn .mvn
RUN ./mvnw -B -ntp dependency:go-offline
COPY src src
RUN ./mvnw -B -ntp package -DskipTests

FROM eclipse-temurin:21.0.4_7-jre-alpine
RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app app
WORKDIR /app
COPY --from=build /build/target/java-api.jar app.jar
USER app
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
