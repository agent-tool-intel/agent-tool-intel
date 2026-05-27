// Sandbox test runner — runs inside Docker container
// Tests MCP server tools with sample inputs and validates outputs
// Usage: npx tsx test-runner.ts <package_spec> <tool_name> [sample_input_json]

interface TestResult {
  toolName: string;
  passed: boolean;
  latencyMs: number;
  outputValid: boolean;
  error?: string;
}

async function testTool(
  packageSpec: string,
  toolName: string,
  sampleInput?: Record<string, unknown>
): Promise<TestResult> {
  const start = Date.now();

  try {
    // Dynamically import the MCP client SDK
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StdioClientTransport } = await import(
      "@modelcontextprotocol/sdk/client/stdio.js"
    );

    const transport = new StdioClientTransport({
      command: "npx",
      args: ["-y", packageSpec],
    });

    const client = new Client(
      { name: "tool-intel-sandbox", version: "0.1.0" },
      { capabilities: {} }
    );

    await client.connect(transport);

    // List available tools
    const { tools } = await client.listTools();

    const targetTool = tools.find((t) => t.name === toolName);

    if (!targetTool) {
      // Try case-insensitive
      const lowerTools = tools.map((t) => t.name.toLowerCase());
      const lowerTarget = toolName.toLowerCase();
      if (!lowerTools.includes(lowerTarget)) {
        return {
          toolName,
          passed: false,
          latencyMs: Date.now() - start,
          outputValid: false,
          error: `Tool "${toolName}" not found. Available: ${tools.map((t) => t.name).join(", ")}`,
        };
      }
    }

    // Generate sample input from schema or use provided
    const input = sampleInput ?? generateSampleInput(targetTool?.inputSchema);

    // Call the tool
    const result = await client.callTool({
      name: toolName,
      arguments: input,
    });

    const latencyMs = Date.now() - start;

    // Validate output
    const outputValid = validateOutput(result, targetTool?.outputSchema);

    await client.close();

    return {
      toolName,
      passed: true,
      latencyMs,
      outputValid,
    };
  } catch (error) {
    return {
      toolName,
      passed: false,
      latencyMs: Date.now() - start,
      outputValid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function generateSampleInput(
  schema: unknown
): Record<string, unknown> {
  if (!schema) return {};

  const s = schema as Record<string, unknown>;
  if (!s.properties) return {};

  const props = s.properties as Record<string, Record<string, unknown>>;
  const sample: Record<string, unknown> = {};

  for (const [key, prop] of Object.entries(props)) {
    switch (prop.type) {
      case "string":
        sample[key] = prop.enum?.[0] ?? "test";
        break;
      case "number":
      case "integer":
        sample[key] = 1;
        break;
      case "boolean":
        sample[key] = true;
        break;
      case "array":
        sample[key] = [];
        break;
      case "object":
        sample[key] = {};
        break;
      default:
        sample[key] = null;
    }
  }

  return sample;
}

function validateOutput(
  result: unknown,
  _outputSchema: unknown
): boolean {
  // Basic validation: result exists and has content
  if (!result) return false;

  const r = result as Record<string, unknown>;
  if (r.isError) return false;

  // Has at least one content item
  if (r.content && Array.isArray(r.content) && r.content.length > 0) {
    return true;
  }

  // Or has a direct result
  if (r.result !== undefined) return true;

  return false;
}

// ── Main ──

const [packageSpec, toolName, sampleInputJson] = process.argv.slice(2);

if (!packageSpec || !toolName) {
  console.error("Usage: test-runner <package_spec> <tool_name> [sample_input_json]");
  process.exit(1);
}

const sampleInput = sampleInputJson ? JSON.parse(sampleInputJson) : undefined;

const result = await testTool(packageSpec, toolName, sampleInput);
console.log(JSON.stringify(result));
process.exit(result.passed ? 0 : 1);
