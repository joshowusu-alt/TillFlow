import AppLaunchLoading from '@/components/AppLaunchLoading';

export default function Loading() {
  return (
    <AppLaunchLoading
      mode="internal"
      shell="content"
      message="Loading section..."
      detail="Please wait while TillFlow gets this section ready."
      showProgress={false}
    />
  );
}
