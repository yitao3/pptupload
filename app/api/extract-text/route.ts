import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // A simple check for pptx file type.
    if (!file.name.endsWith('.pptx') && file.type !== 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
        return NextResponse.json({ error: 'Invalid file type. Please upload a .pptx file.' }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    // Create a temporary file to store the upload
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `${Date.now()}-${file.name}`);

    await fs.writeFile(tempFilePath, fileBuffer);

    // Execute the python script
    const pythonProcess = spawn('python', ['extract_text.py', tempFilePath]);

    let extractedText = '';
    let errorOutput = '';

    // Capture standard output
    for await (const chunk of pythonProcess.stdout) {
      extractedText += chunk;
    }

    // Capture standard error
    for await (const chunk of pythonProcess.stderr) {
        errorOutput += chunk;
    }
    
    // Wait for the script to exit
    const exitCode = await new Promise((resolve, reject) => {
        pythonProcess.on('close', resolve);
        pythonProcess.on('error', reject);
    });

    // Clean up the temporary file
    await fs.unlink(tempFilePath);

    if (exitCode !== 0) {
        console.error(`Python script stderr: ${errorOutput}`);
        // Specifically check if the error is due to the missing module
        if (errorOutput.includes("No module named 'pptx'")) {
             return NextResponse.json({
                error: "Python dependency 'python-pptx' not found. Please install it by running: pip install python-pptx",
                details: errorOutput
            }, { status: 500 });
        }
        return NextResponse.json({ error: 'Failed to extract text from PPTX.', details: errorOutput }, { status: 500 });
    }

    return NextResponse.json({ text: extractedText });
  } catch (error) {
    console.error('Error in /api/extract-text:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Internal server error.', details: errorMessage }, { status: 500 });
  }
} 