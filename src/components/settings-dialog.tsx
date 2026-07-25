import { useState } from "react";
import { Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getApiBaseUrl,
  setApiBaseUrl,
  getDefaultApiBaseUrl,
} from "@/lib/api-config";
import { toast } from "sonner";

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(getApiBaseUrl());

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o) setValue(getApiBaseUrl());
  };

  const save = () => {
    setApiBaseUrl(value);
    toast.success("Backend URL updated");
    setOpen(false);
    // reload so any in-flight query re-reads config
    window.location.reload();
  };

  const reset = () => {
    setApiBaseUrl("");
    setValue(getDefaultApiBaseUrl());
    toast.success("Reset to default");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Settings">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Backend settings</DialogTitle>
          <DialogDescription>
            Configure the base URL of the GramStore backend. Stored locally in
            your browser.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="api-base-url">API base URL</Label>
          <Input
            id="api-base-url"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={getDefaultApiBaseUrl()}
          />
          <p className="text-xs text-muted-foreground">
            Default: <code>{getDefaultApiBaseUrl()}</code>
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={reset}>
            Reset
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
