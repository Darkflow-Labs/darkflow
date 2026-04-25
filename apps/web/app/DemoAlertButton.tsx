"use client";

import { Button } from "@repo/ui/button";

type DemoAlertButtonProps = {
  className?: string;
  label: string;
};

export const DemoAlertButton = ({ className, label }: DemoAlertButtonProps) => {
  const handleClick = () => {
    window.alert(`Hello from the ${label} app.`);
  };

  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      onClick={handleClick}
    >
      Open alert
    </Button>
  );
};
