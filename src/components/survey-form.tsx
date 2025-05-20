"use client";

import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Loader2 } from "lucide-react";
import ClientOnly from "./client-only";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";

const formSchema = z.object({
  surveyUrl: z.string().url({
    message: "Masukkan URL yang valid",
  }),
});

export function SurveyForm({
  onSubmit,
  initialUrl = "",
}: {
  onSubmit: (data: { surveyUrl: string }) => Promise<void>;
  initialUrl?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      surveyUrl: initialUrl,
    },
  });

  // Update form value when initialUrl changes
  useEffect(() => {
    if (initialUrl) {
      form.setValue("surveyUrl", initialUrl);
    }
  }, [initialUrl, form]);

  async function handleSubmit(values: z.infer<typeof formSchema>) {
    try {
      setIsLoading(true);
      setError(null);
      await onSubmit(values);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat memproses URL"
      );
      toast.error("Gagal mengekstrak informasi survei");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <ClientOnly>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-6 mb-6"
          >
            <FormField
              control={form.control}
              name="surveyUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL Survei</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://forms.google.com/..."
                      {...field}
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Memproses...
                </>
              ) : (
                "Dapatkan Informasi"
              )}
            </Button>
          </form>
        </Form>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </ClientOnly>
    </div>
  );
}
