import os
import subprocess
import sys
import argparse
import json
from pdf2image import convert_from_path
from PIL import Image

# --- Start of Fix: Force UTF-8 encoding for all outputs ---
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')
# --- End of Fix ---

def get_libreoffice_path():
    """
    获取LibreOffice可执行文件的路径。
    优先使用 "C:\Program Files\LibreOffice\program\soffice.exe"。
    """
    libreoffice_path = r"C:\Program Files\LibreOffice\program\soffice.exe"
    if os.path.exists(libreoffice_path):
        return libreoffice_path
    return 'soffice'

def convert_ppt_to_pdf(ppt_path, output_dir):
    """
    使用LibreOffice将PPT/PPTX文件转换为PDF。
    """
    print(f"开始将 {ppt_path} 转换为PDF...", file=sys.stderr)
    libreoffice_path = get_libreoffice_path()
    
    if libreoffice_path == 'soffice':
        print("警告：未找到指定的LibreOffice安装路径，将使用默认的'soffice'命令。", file=sys.stderr)
        print("如果转换失败，请确保LibreOffice已安装或在脚本中更新路径。", file=sys.stderr)

    try:
        cmd = [
            libreoffice_path,
            '--headless',
            '--convert-to', 'pdf',
            '--outdir', output_dir,
            ppt_path
        ]
        print(f"执行命令: {' '.join(cmd)}", file=sys.stderr)
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        pdf_filename = os.path.splitext(os.path.basename(ppt_path))[0] + '.pdf'
        pdf_path = os.path.join(output_dir, pdf_filename)

        if os.path.exists(pdf_path):
            print(f"成功转换为PDF: {pdf_path}", file=sys.stderr)
            return pdf_path
        else:
            print("错误：PDF文件转换失败，未在输出目录中找到。", file=sys.stderr)
            return None
            
    except subprocess.CalledProcessError as e:
        print(f"错误：LibreOffice转换过程中出错。", file=sys.stderr)
        print(f"返回码: {e.returncode}", file=sys.stderr)
        print(f"输出: {e.stdout.decode('utf-8', errors='ignore')}", file=sys.stderr)
        print(f"错误信息: {e.stderr.decode('utf-8', errors='ignore')}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"发生未知错误: {e}", file=sys.stderr)
        return None

def create_previews_and_thumbnails(pdf_path, output_dir):
    """
    将PDF文件转换为高质量预览图（JPG）和低质量缩略图（JPG）。
    返回一个包含预览图和缩略图文件路径的字典。
    """
    print(f"开始将 {pdf_path} 转换为图片...", file=sys.stderr)
    # 注意：这里的Poppler路径是硬编码的。如果您的安装路径不同，请修改这里。
    poppler_path = r"F:\\poppler-24.08.0\\Library\\bin"

    previews_dir = os.path.join(output_dir, 'previews')
    thumbnails_dir = os.path.join(output_dir, 'thumbnails')

    if not os.path.exists(previews_dir):
        os.makedirs(previews_dir)
    if not os.path.exists(thumbnails_dir):
        os.makedirs(thumbnails_dir)

    output_paths = {
        "previews": [],
        "thumbnails": []
    }

    try:
        images = convert_from_path(pdf_path, poppler_path=poppler_path, dpi=200)
        print(f"成功读取PDF，共 {len(images)} 页。", file=sys.stderr)
        
        for i, image in enumerate(images):
            # 确保图片是RGB模式，以便保存为JPG
            if image.mode in ('RGBA', 'P'):
                rgb_image = image.convert('RGB')
            else:
                rgb_image = image

            # 保存高质量预览图 (JPG)
            preview_filename = f'page-{i+1}.jpg'
            preview_path = os.path.join(previews_dir, preview_filename)
            rgb_image.save(preview_path, 'JPEG', quality=95)
            output_paths["previews"].append(preview_path)
            print(f"已保存预览图: {preview_path}", file=sys.stderr)

            # 基于原始高质量图创建缩略图
            thumb_image = rgb_image.copy()
            thumb_image.thumbnail((480, 480))  # 保持比例缩放

            # 创建并保存缩略图 (JPG)
            thumbnail_filename = f'page-{i+1}-thumb.jpg'
            thumbnail_path = os.path.join(thumbnails_dir, thumbnail_filename)
            thumb_image.save(thumbnail_path, 'JPEG', quality=85)
            output_paths["thumbnails"].append(thumbnail_path)
            print(f"已保存缩略图: {thumbnail_path}", file=sys.stderr)
        
        print(f"图片和缩略图转换完成！", file=sys.stderr)
        return output_paths
        
    except Exception as e:
        print(f"错误：PDF转图片过程中出错。", file=sys.stderr)
        print(f"错误类型：{type(e)}", file=sys.stderr)
        import traceback
        print(f"错误堆栈：{traceback.format_exc()}", file=sys.stderr)
        return None


def main(ppt_file, base_output_dir):
    """
    主函数，执行从PPT到图片的完整转换流程。
    """
    # 确保输出目录存在
    if not os.path.exists(base_output_dir):
        os.makedirs(base_output_dir)

    # 检查输入PPT文件是否存在
    if not os.path.exists(ppt_file):
        print(f'错误：找不到输入文件 {ppt_file}', file=sys.stderr)
        return

    # --- 第1步: PPT -> PDF ---
    pdf_path = convert_ppt_to_pdf(ppt_file, base_output_dir)
    
    if not pdf_path:
        print("处理失败：未能从PPT生成PDF文件。", file=sys.stderr)
        return

    # --- 第2步: PDF -> Images & Thumbnails ---
    paths = create_previews_and_thumbnails(pdf_path, base_output_dir)
    
    if paths:
        # 成功后，将生成的路径以JSON格式打印到标准输出
        # Node.js可以捕获这个输出
        page_count = len(paths.get("previews", []))
        result = {
            "previews": paths.get("previews", []),
            "thumbnails": paths.get("thumbnails", []),
            "page_count": page_count
        }
        print(json.dumps(result))
    else:
        print("\n处理失败：未能将PDF转换为图片和缩略图。", file=sys.stderr)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='将PPT/PPTX文件转换为PDF，然后生成预览图和缩略图。')
    parser.add_argument('ppt_file', type=str, help='输入的PPT/PPTX文件路径')
    parser.add_argument('output_dir', type=str, help='所有输出文件的根目录')
    args = parser.parse_args()
    
    main(args.ppt_file, args.output_dir) 