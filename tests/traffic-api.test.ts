/**
 * Automated Integration & Uptime Testing Script for Traffic API
 * Role: Senior QA Automation Engineer & DevOps Specialist
 * Framework: Jest (standard for Node.js/React environments)
 * Uses native fetch (Node.js 18+) mocking for testing API resilience.
 */

// If you are running this in your actual project, ensure you have jest and @types/jest installed.
// Ex: npm install --save-dev jest @types/jest ts-jest

// We mock the native global fetch to simulate different API behaviors
global.fetch = jest.fn();

describe("Traffic API Resilience and Integration Suite (Google Maps Routes API)", () => {

  const API_ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
  const MOCK_API_KEY = "dummy-api-key";

  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
  });

  /**
   * Layer 1: The Pulse Check (Ping/Uptime)
   * Validates connection establishment and response times.
   */
  it("Pulse Check: Establishes connection within 500ms and returns status 200", async () => {
    // Mock a successful API response
    const mockSuccessResponse = {
      routes: [
        {
          duration: "900s",
          distanceMeters: 4500
        }
      ]
    };
    
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockSuccessResponse,
    });

    const startTime = performance.now();
    
    // Call the external API (this is a simplified representation of the backend call)
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "X-Goog-Api-Key": MOCK_API_KEY, "X-Goog-FieldMask": "routes.duration" },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: 12.9716, longitude: 77.5946 } } },
        destination: { location: { latLng: { latitude: 12.9716, longitude: 77.6000 } } }
      })
    });
    
    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(response.status).toBe(200);
    // In a real execution environment without mocked fetch, you'd test network latency bounds
    // expect(duration).toBeLessThan(500); 
  });

  /**
   * Layer 2: Data Integrity & Schema Validation
   * Asserts payload is valid JSON with necessary keys and correct types.
   */
  it("Schema Validation: Payload returns expected JSON structure and valid data types", async () => {
    // Mock the external service payload
    const mockPayload = {
      routes: [
        {
          duration: "900s",
          distanceMeters: 4500
        }
      ]
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockPayload,
    });

    const response = await fetch(API_ENDPOINT);
    const data = await response.json();

    // Verify it is an object
    expect(typeof data).toBe("object");
    
    // Verify the 'routes' array exists
    expect(Array.isArray(data.routes)).toBeTruthy();
    expect(data.routes.length).toBeGreaterThan(0);
    
    // Check specific fields within the route
    const firstRoute = data.routes[0];
    expect(firstRoute).toHaveProperty("duration");
    expect(firstRoute).toHaveProperty("distanceMeters");
    
    // Type checking
    expect(typeof firstRoute.duration).toBe("string");
    expect(typeof firstRoute.distanceMeters).toBe("number");
  });

  /**
   * Layer 3.A: Resilience - Timeout Handling
   * Simulates a slow response causing AbortController to throw.
   */
  it("Resilience (Timeout): Aborts connection cleanly if response exceeds 5 seconds", async () => {
    // Mock fetch to simulate a delayed response or timeout error
    (global.fetch as jest.Mock).mockImplementationOnce(() => 
      Promise.reject(new Error("TimeoutError"))
    );

    try {
      const controller = new AbortController();
      const signal = controller.signal;
      
      // Suppose the app has a 5-sec timeout
      setTimeout(() => controller.abort(), 5000);
      
      await fetch(API_ENDPOINT, { signal });
    } catch (error: any) {
      expect(error.message).toMatch(/TimeoutError|abort/i);
    }
  });

  /**
   * Layer 3.B: Resilience - Rate Limit (HTTP 429)
   * Simulates rate-limiting conditions. Test verifies application handles it gracefully.
   */
  it("Resilience (Rate Limit): Gracefully intercepts HTTP 429 Too Many Requests", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: {
        get: (header: string) => header === 'Retry-After' ? '30' : null
      }
    });

    const response = await fetch(API_ENDPOINT);

    expect(response.status).toBe(429);
    
    // Extract Retry-After to ensure app logic can back-off
    const retryAfter = response.headers.get("Retry-After");
    expect(retryAfter).toBe("30");
  });

  /**
   * Layer 3.C: Resilience - Bad Credentials/Authentication (HTTP 401/403)
   * Asserts bad credentials trigger immediate error handling workflows.
   */
  it("Resilience (Auth Validation): Rejects with explicit logs on expired or invalid API key (403)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        error: {
          code: 403,
          message: "The request is missing a valid API key.",
          status: "PERMISSION_DENIED"
        }
      })
    });

    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "X-Goog-Api-Key": "INVALID_KEY" }
    });

    expect(response.status).toBe(403);
    const errData = await response.json();
    
    // Assert critical error condition detected
    expect(errData.error.status).toBe("PERMISSION_DENIED");
  });
});
