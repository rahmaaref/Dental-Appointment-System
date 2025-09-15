import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';

interface CompletionDialogProps {
  isOpen: boolean;
  onClose: (refresh?: boolean) => void;
  appointmentId: string;
  appointmentName: string;
}

const CompletionDialog: React.FC<CompletionDialogProps> = ({
  isOpen,
  onClose,
  appointmentId,
  appointmentName
}) => {
  const { toast } = useToast();
  const [mode, setMode] = useState<"now" | "manual">("now");
  const [completionHour, setCompletionHour] = useState(() => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  });
  const [procedures, setProcedures] = useState("");
  const [loading, setLoading] = useState(false);

  const validHHMM = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

  const handleConfirm = async () => {
    if (mode === "manual" && !validHHMM(completionHour)) {
      toast({
        variant: "destructive",
        title: "Invalid time",
        description: "Please enter time in HH:MM format (24-hour)",
      });
      return;
    }

    setLoading(true);
    try {
      const body: any = {
        status: "completed",
        use_now: mode === "now",
        procedures_done: procedures || undefined,
      };
      if (mode === "manual") body.completion_hour = completionHour;

      const response = await api(`/api/appointments/${appointmentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Appointment marked as completed",
        });
        onClose(true); // trigger table refresh
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: response.error?.message || "Failed to complete appointment",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Network error occurred",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setMode("now");
    setProcedures("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark Appointment as Completed</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              Completing appointment for: <strong>{appointmentName}</strong>
            </p>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">Completion Time</Label>
            <RadioGroup value={mode} onValueChange={(value: "now" | "manual") => setMode(value)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="now" id="now" />
                <Label htmlFor="now" className="flex-1">
                  Use current time (system)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="manual" id="manual" />
                <Label htmlFor="manual" className="flex-1">
                  Enter time manually
                </Label>
              </div>
            </RadioGroup>
          </div>

          {mode === "now" && (
            <div className="p-3 bg-muted rounded-md">
              <Label className="text-sm text-muted-foreground">Current time:</Label>
              <Input
                value={new Date().toLocaleTimeString('en-GB', { 
                  hour: '2-digit', 
                  minute: '2-digit',
                  hour12: false 
                })}
                disabled
                className="mt-1"
              />
            </div>
          )}

          {mode === "manual" && (
            <div>
              <Label htmlFor="completion-time" className="text-sm font-medium">
                Completion Time (HH:MM)
              </Label>
              <Input
                id="completion-time"
                type="time"
                value={completionHour}
                onChange={(e) => setCompletionHour(e.target.value)}
                className="mt-1"
              />
            </div>
          )}

          <div>
            <Label htmlFor="procedures" className="text-sm font-medium">
              Procedures Done (Optional)
            </Label>
            <Textarea
              id="procedures"
              placeholder="Describe the procedures performed..."
              value={procedures}
              onChange={(e) => setProcedures(e.target.value)}
              className="mt-1"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? "Completing..." : "Mark as Completed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CompletionDialog;
