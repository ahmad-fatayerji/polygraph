import type { PipelineStage } from "@/lib/polygraph/types";

export const PIPELINE_STAGE_OPTIONS: Array<{
  value: PipelineStage;
  label: string;
  background: string;
  border: string;
}> = [
  {
    value: "sensing",
    label: "Sensing",
    background: "var(--pipeline-sensing-bg)",
    border: "var(--pipeline-sensing-border)",
  },
  {
    value: "perception",
    label: "Perception",
    background: "var(--pipeline-perception-bg)",
    border: "var(--pipeline-perception-border)",
  },
  {
    value: "planning",
    label: "Planning",
    background: "var(--pipeline-planning-bg)",
    border: "var(--pipeline-planning-border)",
  },
  {
    value: "control-actuators",
    label: "Control",
    background: "var(--pipeline-control-actuators-bg)",
    border: "var(--pipeline-control-actuators-border)",
  },
];

export const getPipelineStageOption = (stage: unknown) =>
  PIPELINE_STAGE_OPTIONS.find((option) => option.value === stage);
