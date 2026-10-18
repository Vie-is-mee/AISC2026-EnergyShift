def profile(quantity, duration, power):
    """Explicit synthetic lot evidence for test fixtures, never an input default."""
    return {"duration_min": duration, "avg_kw": power, "power_source": "SYNTHETIC",
            "lot_confirmation": {"quantity": quantity, "duration_min": duration,
                                 "source_type": "SYNTHETIC", "reference": "unit-test-lot-confirmation"}}
