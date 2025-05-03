export default function Loading() {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4 py-16 text-center bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
          <h2 className="mt-6 text-xl font-medium text-gray-900 dark:text-white">Loading...</h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Please wait while we prepare your content.</p>
        </div>
      </div>
    );
  }