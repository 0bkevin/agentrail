import type { ServiceType } from "@/lib/agentrail-types";

const map: Record<string, ServiceType> = {
  paidapi: "paid_api",
  paid_api: "paid_api",
  iotaction: "iot_action",
  iot_action: "iot_action",
  humantask: "human_task",
  human_task: "human_task",
};

function normalize(value: string) {
  return value.replace(/[\s-]/g, "").toLowerCase();
}

export function parseServiceType(input: string | undefined | null): ServiceType | null {
  if (!input) {
    return null;
  }

  const raw = input.trim();
  const direct = map[raw as keyof typeof map];
  if (direct) {
    return direct;
  }

  return map[normalize(raw)] ?? null;
}

export function toReadmeServiceType(value: ServiceType) {
  switch (value) {
    case "paid_api":
      return "PaidApi";
    case "iot_action":
      return "IoTAction";
    case "human_task":
      return "HumanTask";
  }
}
