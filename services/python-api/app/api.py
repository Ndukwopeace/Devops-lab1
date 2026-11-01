from flask import Flask, jsonify, request


def create_app(repo):
    """Build the Flask app around any repository object (real or fake)."""
    app = Flask(__name__)

    @app.get("/health")
    def health():
        try:
            repo.ping()
        except Exception:
            app.logger.exception("database ping failed")
            return jsonify(status="unavailable"), 503
        return jsonify(status="ok")

    @app.get("/items")
    def list_items():
        return jsonify(repo.list_items())

    @app.post("/items")
    def add_item():
        body = request.get_json(silent=True) or {}
        name = body.get("name")
        if not isinstance(name, str) or not name.strip() or len(name) > 100:
            return jsonify(error="name must be a non-empty string up to 100 characters"), 400
        return jsonify(repo.add_item(name.strip())), 201

    return app
