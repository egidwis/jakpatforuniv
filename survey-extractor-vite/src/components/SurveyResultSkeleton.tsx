export function SurveyResultSkeleton() {
  return (
    <div className="card max-w-2xl mx-auto">
      <div className="card-header">
        <div className="flex justify-between items-start">
          <div className="h-7 w-3/4 bg-muted animate-pulse rounded"></div>
          <div className="h-6 w-24 bg-muted animate-pulse rounded"></div>
        </div>
        <div className="h-4 w-full mt-2 bg-muted animate-pulse rounded"></div>
        <div className="h-4 w-2/3 mt-1 bg-muted animate-pulse rounded"></div>
      </div>
      <div className="card-content space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="h-4 w-32 bg-muted animate-pulse rounded"></div>
            <div className="h-8 w-16 bg-muted animate-pulse rounded"></div>
          </div>
          <div className="space-y-2">
            <div className="h-4 w-32 bg-muted animate-pulse rounded"></div>
            <div className="h-8 w-16 bg-muted animate-pulse rounded"></div>
          </div>
        </div>

        <div className="separator"></div>

        <div className="space-y-3">
          <div className="flex justify-between">
            <div className="h-4 w-24 bg-muted animate-pulse rounded"></div>
            <div className="h-4 w-32 bg-muted animate-pulse rounded"></div>
          </div>
          <div className="flex justify-between">
            <div className="h-4 w-24 bg-muted animate-pulse rounded"></div>
            <div className="h-4 w-32 bg-muted animate-pulse rounded"></div>
          </div>
          <div className="flex justify-between">
            <div className="h-4 w-24 bg-muted animate-pulse rounded"></div>
            <div className="h-4 w-32 bg-muted animate-pulse rounded"></div>
          </div>
        </div>

        <div className="separator"></div>

        <div className="space-y-2">
          <div className="h-4 w-24 bg-muted animate-pulse rounded"></div>
          <div className="h-4 w-full bg-muted animate-pulse rounded"></div>
          <div className="h-4 w-3/4 bg-muted animate-pulse rounded"></div>
        </div>
      </div>
    </div>
  );
}
