using System.Collections.Concurrent;
using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Net;
using System.Net.Http.Json;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddConsole();

builder.Services.AddHttpClient("payments");

var app = builder.Build();

var activitySource = new ActivitySource("newrelic-apm-pattern-sample-dotnet-otel-hybrid");
var meter = new Meter("newrelic-apm-pattern-sample-dotnet-otel-hybrid", "1.0.0");
var ordersCreated = meter.CreateCounter<long>("orders.created");
var ordersFailed = meter.CreateCounter<long>("orders.failed");
var ordersConfirmationFailed = meter.CreateCounter<long>("orders.confirmation_failed");
var checkoutDuration = meter.CreateHistogram<double>("checkout.duration", "ms");

var orders = new ConcurrentDictionary<string, OrderRecord>();

var paymentEndpoint = Environment.GetEnvironmentVariable("PAYMENT_ENDPOINT")
    ?? "http://127.0.0.1:3000/fake/charge";

app.MapGet("/health", () => Results.Ok(new { ok = true }));

app.MapPost("/orders", async (CreateOrderRequest request, IHttpClientFactory httpClientFactory) =>
{
    var start = Stopwatch.GetTimestamp();

    using var processSpan = activitySource.StartActivity("process-order", ActivityKind.Server);
    processSpan?.SetTag("app.pattern", "dotnet-otel-hybrid");

    using (var validateSpan = activitySource.StartActivity("validate-order", ActivityKind.Internal))
    {
        var isInvalid =
            string.IsNullOrWhiteSpace(request.UserId) ||
            string.IsNullOrWhiteSpace(request.PaymentToken) ||
            request.Items.Count == 0 ||
            request.Items.Any(item => item.Quantity <= 0 || item.UnitPrice <= 0);

        if (isInvalid)
        {
            ordersFailed.Add(1, new KeyValuePair<string, object?>("reason", "validation"));
            validateSpan?.SetStatus(ActivityStatusCode.Error, "invalid-order");
            return Results.BadRequest(new { error = "invalid-order" });
        }
    }

    var orderId = Guid.NewGuid().ToString("N");
    var total = request.Items.Sum(item => item.Quantity * item.UnitPrice);

    var draft = new OrderRecord(orderId, request.UserId, "draft", total, DateTimeOffset.UtcNow);
    orders[orderId] = draft;

    using var paymentSpan = activitySource.StartActivity("charge-payment", ActivityKind.Client);
    var client = httpClientFactory.CreateClient("payments");
    var paymentResponse = await client.PostAsJsonAsync(paymentEndpoint, new PaymentRequest(request.PaymentToken));

    if (paymentResponse.StatusCode != HttpStatusCode.OK)
    {
        var failed = draft with { Status = "payment_failed" };
        orders[orderId] = failed;
        ordersFailed.Add(1, new KeyValuePair<string, object?>("reason", "payment"));
        ordersConfirmationFailed.Add(1);
        paymentSpan?.SetStatus(ActivityStatusCode.Error, "payment-declined");

        checkoutDuration.Record(Stopwatch.GetElapsedTime(start).TotalMilliseconds);
        return Results.StatusCode(StatusCodes.Status402PaymentRequired);
    }

    using var confirmSpan = activitySource.StartActivity("confirm-order", ActivityKind.Internal);
    var confirmed = draft with { Status = "confirmed" };
    orders[orderId] = confirmed;
    ordersCreated.Add(1);
    checkoutDuration.Record(Stopwatch.GetElapsedTime(start).TotalMilliseconds);

    return Results.Ok(confirmed);
});

app.MapGet("/orders/{id}", (string id) =>
{
    using var span = activitySource.StartActivity("get-order", ActivityKind.Internal);
    return orders.TryGetValue(id, out var order)
        ? Results.Ok(order)
        : Results.NotFound(new { error = "order-not-found" });
});

app.MapPost("/fake/charge", (PaymentRequest request) =>
{
    using var span = activitySource.StartActivity("fake-payment-charge", ActivityKind.Server);
    if (string.Equals(request.Token, "declined", StringComparison.OrdinalIgnoreCase))
    {
        return Results.StatusCode(StatusCodes.Status402PaymentRequired);
    }
    return Results.Ok(new { status = "approved" });
});

app.Run();

public sealed record OrderItem(string Sku, int Quantity, decimal UnitPrice);
public sealed record CreateOrderRequest(string UserId, string PaymentToken, List<OrderItem> Items);
public sealed record PaymentRequest(string Token);
public sealed record OrderRecord(
    string Id,
    string UserId,
    string Status,
    decimal TotalAmount,
    DateTimeOffset CreatedAt
);
