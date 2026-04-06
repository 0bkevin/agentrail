import type { ServiceType } from "@/lib/agentrail-types";
import { parseServiceType, toReadmeServiceType } from "@/lib/service-type";

type LlmPlan = {
  serviceType: ServiceType;
  normalizedRequest: Record<string, string>;
};

function fallbackPlan(prompt: string): LlmPlan {
  const normalized = prompt.toLowerCase();
  if (normalized.includes("sensor") || normalized.includes("temperature") || normalized.includes("door") || normalized.includes("iot")) {
    return {
      serviceType: "iot_action",
      normalizedRequest: {
        task: "device-command",
        deviceId: normalized.includes("door") ? "dock-door-12" : "dock-sensor-12",
        action: normalized.includes("door") ? "unlock" : "read-temperature",
      },
    };
  }

  if (normalized.includes("fix") || normalized.includes("human") || normalized.includes("triage")) {
    return {
      serviceType: "human_task",
      normalizedRequest: {
        task: "human-resolution",
        issue: prompt,
        priority: "high",
      },
    };
  }

  return {
    serviceType: "paid_api",
    normalizedRequest: {
      task: "company-enrichment",
      target: prompt,
      resultFormat: "json",
    },
  };
}

export async function planRequestWithLlm(prompt: string) {
  const apiKey = process.env.GRADIENT_API_KEY;
  if (!apiKey) {
    const fallback = fallbackPlan(prompt);
    return {
      ...fallback,
      model: "fallback-heuristic",
    };
  }

  const baseUrl = process.env.GRADIENT_BASE_URL || "https://api.gradient.ai/api";
  const model = process.env.GRADIENT_MODEL || "llama3.1-8b-instruct";

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an agent planner. Return strict JSON with keys: serviceType, normalizedRequest. serviceType must be one of PaidApi, IoTAction, HumanTask.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const fallback = fallbackPlan(prompt);
    return {
      ...fallback,
      model: "fallback-heuristic",
    };
  }

  const json = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    const fallback = fallbackPlan(prompt);
    return {
      ...fallback,
      model: "fallback-heuristic",
    };
  }

  try {
    const parsed = JSON.parse(content) as {
      serviceType?: string;
      normalizedRequest?: Record<string, unknown>;
    };

    const serviceType = parseServiceType(parsed.serviceType);
    if (!serviceType || !parsed.normalizedRequest) {
      throw new Error("Invalid LLM plan payload.");
    }

    const normalizedRequest = Object.fromEntries(
      Object.entries(parsed.normalizedRequest).map(([key, value]) => [key, String(value)]),
    );

    return {
      serviceType,
      normalizedRequest,
      model,
      readmeServiceType: toReadmeServiceType(serviceType),
    };
  } catch {
    const fallback = fallbackPlan(prompt);
    return {
      ...fallback,
      model: "fallback-heuristic",
    };
  }
}
