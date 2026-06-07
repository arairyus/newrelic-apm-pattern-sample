FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY apps/dotnet-otel-hybrid/*.csproj ./
RUN dotnet restore ./DotnetOtelHybrid.csproj

COPY apps/dotnet-otel-hybrid/. ./
RUN dotnet publish ./DotnetOtelHybrid.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

ENV NEW_RELIC_HOME=/app/newrelic
ENV CORECLR_ENABLE_PROFILING=1
ENV CORECLR_PROFILER={36032161-FFC0-4B61-B559-F6C5D41BAE5A}
ENV CORECLR_NEWRELIC_HOME=/app/newrelic
ENV CORECLR_PROFILER_PATH=/app/newrelic/linux-arm64/libNewRelicProfiler.so
ENV ASPNETCORE_URLS=http://+:3000

COPY --from=build /app/publish ./
COPY --from=build /src/newrelic.config /app/newrelic/newrelic.config

EXPOSE 3000
ENTRYPOINT ["dotnet", "DotnetOtelHybrid.dll"]
