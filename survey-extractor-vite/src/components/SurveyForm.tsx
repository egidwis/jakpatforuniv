import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Loader2 } from "lucide-react";
import { ClientOnly } from "./ClientOnly";
import { toast } from "sonner";

const formSchema = z.object({
  surveyUrl: z.string().url({
    message: "Masukkan URL yang valid",
  }),
});

type FormValues = z.infer<typeof formSchema>;

interface SurveyFormProps {
  onSubmit: (data: { surveyUrl: string }) => Promise<void>;
  initialUrl?: string;
}

export function SurveyForm({ onSubmit, initialUrl = "" }: SurveyFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      surveyUrl: initialUrl,
    },
  });

  // Update form value when initialUrl changes
  useEffect(() => {
    if (initialUrl) {
      setValue("surveyUrl", initialUrl);
    }
  }, [initialUrl, setValue]);

  async function handleFormSubmit(values: FormValues) {
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
        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          className="space-y-6 mb-6"
        >
          <div className="form-group">
            <label htmlFor="surveyUrl" className="form-label">
              URL Survei
            </label>
            <input
              id="surveyUrl"
              type="text"
              className="form-input"
              placeholder="https://forms.google.com/..."
              disabled={isLoading}
              {...register("surveyUrl")}
            />
            {errors.surveyUrl && (
              <p className="form-error">{errors.surveyUrl.message}</p>
            )}
          </div>
          
          <button 
            type="submit" 
            className="button button-primary w-full" 
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="flex items-center justify-center">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                <span>Memproses...</span>
              </div>
            ) : (
              "Dapatkan Informasi"
            )}
          </button>
        </form>

        {error && (
          <div className="alert alert-error">
            <h4 className="alert-title">Error</h4>
            <p className="alert-description">{error}</p>
          </div>
        )}
      </ClientOnly>
    </div>
  );
}
