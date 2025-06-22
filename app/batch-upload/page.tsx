'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import toast, { Toaster } from 'react-hot-toast';

enum FileStatus {
  Pending = 'pending',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
  Skipped = 'skipped',
}

interface ProcessableFile {
  id: string;
  file: File;
  status: FileStatus;
  result?: string | null;
}

const StatusIndicator = ({ status }: { status: FileStatus }) => {
  const baseClasses = "text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full";
  const statusMap = {
    [FileStatus.Pending]: { text: 'Pending', classes: 'text-gray-600 bg-gray-200' },
    [FileStatus.Processing]: { text: 'Processing...', classes: 'text-blue-600 bg-blue-200 animate-pulse' },
    [FileStatus.Completed]: { text: 'Completed', classes: 'text-green-600 bg-green-200' },
    [FileStatus.Failed]: { text: 'Failed', classes: 'text-red-600 bg-red-200' },
    [FileStatus.Skipped]: { text: 'Skipped', classes: 'text-yellow-600 bg-yellow-200' },
  };
  const { text, classes } = statusMap[status];
  return <span className={`${baseClasses} ${classes}`}>{text}</span>;
};


export default function BatchUploadPage() {
  const [files, setFiles] = useState<ProcessableFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles
      .filter(file => file.name.endsWith('.ppt') || file.name.endsWith('.pptx'))
      .map(file => ({
        id: `${file.name}-${file.lastModified}`,
        file,
        status: FileStatus.Pending,
        result: null,
      }));
    
    // Simple de-duplication
    setFiles(prev => {
        const existingIds = new Set(prev.map(f => f.id));
        return [...prev, ...newFiles.filter(nf => !existingIds.has(nf.id))];
    });

  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/vnd.ms-powerpoint': ['.ppt'], 'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'] }
  });

  const handleStartProcessing = async () => {
    const filesToProcess = files.filter(f => f.status === FileStatus.Pending);
    if (filesToProcess.length === 0) {
      toast.error('No pending files to process.');
      return;
    }

    setIsProcessing(true);
    toast.success(`Starting to process ${filesToProcess.length} files...`);

    await (async () => {
        for (const file of filesToProcess) {
             // Set status to processing for the current file
            setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: FileStatus.Processing } : f));
            
            const formData = new FormData();
            formData.append('file', file.file);
            
            try {
                const response = await fetch('/api/process-ppt', {
                method: 'POST',
                body: formData,
                });

                const data = await response.json();

                if (!response.ok) {
                throw new Error(data.details || data.error || 'Unknown error');
                }

                // --- New: Handle skipped files ---
                if (data.skipped) {
                    setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: FileStatus.Skipped, result: data.reason } : f));
                    continue; // Use `continue` to proceed to the next file in the loop
                }

                console.log(`--- Processing Result for: ${file.file.name} ---`);
                console.log('All fields from backend:', data);
                console.log('--------------------------------------------------');
                
                // Mark as completed
                setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: FileStatus.Completed, result: `Success! New Title: ${data.title}` } : f));

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Processing failed.';
                console.error(`Failed to process ${file.file.name}:`, error);
                // Mark as failed
                setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: FileStatus.Failed, result: errorMessage } : f));
            }
        }
    })();

    setIsProcessing(false);
    toast.success('All pending files have been processed.');
  };

  const clearList = () => {
    setFiles([]);
  }

  return (
    <main className="flex min-h-screen flex-col items-center p-4 sm:p-8 md:p-12 bg-gray-50">
      <Toaster position="top-center" reverseOrder={false} />
      <div className="w-full max-w-4xl bg-white p-6 sm:p-8 rounded-lg shadow-lg">
        <h1 className="text-xl sm:text-2xl font-bold mb-2 text-center text-gray-800">Batch PPT Processor</h1>
        <p className="text-center text-gray-500 mb-6">Upload multiple .ppt or .pptx files to automatically process and save them to the database.</p>

        <div {...getRootProps()} className={`p-10 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${isDragActive ? 'border-violet-600 bg-violet-50' : 'border-gray-300 hover:border-gray-400'}`}>
          <input {...getInputProps()} />
          <p className="text-gray-500">Drag & drop .pptx files here, or click to select files</p>
        </div>

        {files.length > 0 && (
            <div className="mt-8">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-semibold text-gray-700">File Queue ({files.length})</h2>
                    <div>
                        <button onClick={clearList} disabled={isProcessing} className="mr-2 text-sm text-red-500 hover:text-red-700 disabled:text-gray-400">Clear List</button>
                        <button onClick={handleStartProcessing} disabled={isProcessing || files.every(f => f.status !== FileStatus.Pending)} className="bg-violet-600 text-white font-bold py-2 px-4 rounded-md hover:bg-violet-700 disabled:bg-gray-400">
                            {isProcessing ? 'Processing...' : 'Start Processing'}
                        </button>
                    </div>
                </div>

                <ul className="space-y-3">
                    {files.map(f => (
                        <li key={f.id} className="p-3 bg-gray-50 rounded-lg border flex items-center justify-between">
                            <div className="flex-grow overflow-hidden mr-4">
                                <p className="text-sm font-medium text-gray-800 truncate">{f.file.name}</p>
                                {f.result && <p className="text-xs text-gray-500 mt-1 truncate">{f.result}</p>}
                            </div>
                            <StatusIndicator status={f.status} />
                        </li>
                    ))}
                </ul>
            </div>
        )}
      </div>
    </main>
  );
} 