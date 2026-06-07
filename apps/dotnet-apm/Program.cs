using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using NewRelic.Api.Agent;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Services.AddHttpClient("payments");

var app = builder.Build();
var orders = new ConcurrentDictionary<string, OrderRecord>();
var paymentEndpoint = Environment.GetEnvironmentVariable("PAYMENT_ENDPOINT")
    ?? "http://127.0.0.1:3000/fake/charge";

app.MapGet("/health", () => Results.Ok(new { ok = true }));

app.MapPost("/orders", async (CreateOrderRequest request, IHttpClientFactory httpClientFactory) =>
{
    var transaction = NewRelic.Api.Agent.NewRelic.GetAgent().CurrentTransaction;
    transaction.AddCustomAttribute("app.pattern", "dotnet-apm");
    transaction.AddCustomAttribute("order.item_count", request.Items.Count);

    if (!OrderInstrumentation.ValidateOrder(request))
    {
        transaction.AddCustomAttribute("order.validation", "failed");
        return Results.BadRequest(new { error = "invalid-order" });
    }

    var orderId = Guid.NewGuid().ToString("N");
    var total = request.Items.Sum(item => item.Quantity * item.UnitPrice);
    var draft = new OrderRecord(orderId, request.UserId, "draft", total, DateTimeOffset.UtcNow);
    orders[orderId] = draft;

    var statusCode = await OrderInstrumentation.ChargePayment(request.PaymentToken, httpClientFactory, paymentEndpoint);
    if (statusCode != HttpStatusCode.OK)
    {
        orders[orderId] = draft with { Status = "payment_failed" };
        transaction.AddCustomAttribute("order.payment_status", "declined");
        return Results.StatusCode(StatusCodes.Status402PaymentRequired);
    }

    var confirmed = OrderInstrumentation.ConfirmOrder(draft);
    orders[orderId] = confirmed;
    transaction.AddCustomAttribute("order.payment_status", "approved");
    return Results.Ok(confirmed);
});

app.MapGet("/orders/{id}", (string id) =>
{
    var transaction = NewRelic.Api.Agent.NewRelic.GetAgent().CurrentTransaction;
    transaction.AddCustomAttribute("order.lookup_id", id);

    return orders.TryGetValue(id, out var order)
        ? Results.Ok(order)
        : Results.NotFound(new { error = "order-not-found" });
});

app.MapPost("/fake/charge", (PaymentRequest request) =>
{
    if (string.Equals(request.Token, "declined", StringComparison.OrdinalIgnoreCase))
    {
        return Results.StatusCode(StatusCodes.Status402PaymentRequired);
    }

    return Results.Ok(new { status = "approved" });
});

app.Run();

public static class OrderInstrumentation
{
    [Trace]
    public static bool ValidateOrder(CreateOrderRequest request)
    {
        return
            !string.IsNullOrWhiteSpace(request.UserId) &&
            !string.IsNullOrWhiteSpace(request.PaymentToken) &&
            request.Items.Count > 0 &&
            request.Items.All(item => item.Quantity > 0 && item.UnitPrice > 0);
    }

    [Trace]
    public static async Task<HttpStatusCode> ChargePayment(
        string paymentToken,
        IHttpClientFactory httpClientFactory,
        string paymentEndpoint)
    {
        var client = httpClientFactory.CreateClient("payments");
        var response = await client.PostAsJsonAsync(paymentEndpoint, new PaymentRequest(paymentToken));
        return response.StatusCode;
    }

    [Trace]
    public static OrderRecord ConfirmOrder(OrderRecord draft)
    {
        return draft with { Status = "confirmed" };
    }
}

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
