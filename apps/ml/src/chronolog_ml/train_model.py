"""Train the log classifier and save it. Run: python -m chronolog_ml.train_model"""

import json
from datetime import UTC, datetime

from .classifier import LogClassifier
from .config import METRICS_PATH, MODEL_PATH, TRAINING_DATA_SIZE
from .data_generator import LogDataGenerator


def train_model():
    """Main training function"""

    print("=" * 60)
    print("🚀 CHRONOLOG - ML MODEL TRAINING")
    print("=" * 60)

    # Step 1: Generate training data
    print("\n📊 Step 1: Generating training data...")
    generator = LogDataGenerator()
    df = generator.generate_dataset(TRAINING_DATA_SIZE)

    # Step 2: Train classifier
    print("\n🤖 Step 2: Training classifier...")
    classifier = LogClassifier()
    metrics = classifier.train(df, save_model=True)

    # Step 3: Display results
    print("\n" + "=" * 60)
    print("✅ TRAINING COMPLETE!")
    print("=" * 60)
    print(f"\n🎯 Overall Accuracy: {metrics['accuracy'] * 100:.2f}%")
    print(f"📁 Model saved to: {MODEL_PATH.parent}/")

    # Per-class metrics
    print("\n📊 Per-Class Performance:")
    for severity, scores in metrics["classification_report"].items():
        if isinstance(scores, dict) and "f1-score" in scores:
            print(
                f"  {severity:10s}: Precision={scores['precision']:.2%}, "
                f"Recall={scores['recall']:.2%}, F1={scores['f1-score']:.2%}"
            )

    # Feature importance
    print("\n🔍 Top 10 Important Features:")
    top_features = classifier.get_feature_importance(10)
    for i, feat in enumerate(top_features, 1):
        print(f"  {i}. {feat['feature']:20s} (importance: {feat['importance']:.4f})")

    # Save metrics
    metrics_file = METRICS_PATH
    with open(metrics_file, "w") as f:
        json_metrics = {
            "version": "2.0.0",
            "training_date": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "accuracy": metrics["accuracy"],
            "classification_report": metrics["classification_report"],
            "confusion_matrix": metrics["confusion_matrix"],
            "classes": metrics["classes"],
            "training_samples": metrics["training_samples"],
            "test_samples": metrics["test_samples"],
        }
        json.dump(json_metrics, f, indent=2)

    print(f"\n📄 Metrics saved to: {metrics_file}")

    # Test with sample logs
    print("\n🧪 Testing with sample logs:")
    test_cases = [
        "System crash detected in auth module",
        "Failed to connect to PostgreSQL",
        "High memory usage detected: 87%",
        "User logged in: john_doe",
        "Processing request ID: req_12345",
    ]

    for msg in test_cases:
        result = classifier.predict(msg)
        print(f"\n  Message: {msg}")
        print(
            f"  → Predicted: {result['predicted_severity']} "
            f"(confidence: {result['confidence']:.2%})"
        )

    print("\n" + "=" * 60)
    print("🎉 All done! Model is ready for use.")
    print("=" * 60)


if __name__ == "__main__":
    train_model()
