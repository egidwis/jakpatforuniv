from flask import Flask, render_template, request, jsonify
from form_parser import get_form_info, FormNotFoundException, AuthRequiredException, NetworkException

app = Flask(__name__)

@app.route('/', methods=['GET'])
def index():
    """Render the main page."""
    return render_template('index.html')

@app.route('/get_form_info', methods=['POST'])
def process_form():
    """Process the form URL and return information."""
    url = request.form.get('url', '')

    if not url:
        return jsonify({
            'success': False,
            'error': 'URL tidak boleh kosong.'
        })

    try:
        form_info = get_form_info(url)
        return jsonify({
            'success': True,
            'form_info': form_info
        })
    except FormNotFoundException as e:
        return jsonify({
            'success': False,
            'error': f'Form tidak ditemukan: {str(e)}'
        })
    except AuthRequiredException as e:
        return jsonify({
            'success': False,
            'error': f'Form memerlukan autentikasi: {str(e)}'
        })
    except NetworkException as e:
        return jsonify({
            'success': False,
            'error': f'Gagal mengambil data form: {str(e)}'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Terjadi kesalahan: {str(e)}'
        })

if __name__ == '__main__':
    app.run(debug=True)
