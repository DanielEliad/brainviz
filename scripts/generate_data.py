#!/usr/bin/env python3
import random
import math
import csv
from pathlib import Path

random.seed(42)

NUM_FRAMES = 100
NUM_NODES = 30
BASE_NODES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]

def generate_node_name(index: int) -> str:
    if index < len(BASE_NODES):
        return BASE_NODES[index]
    return f"N{index}"

def generate_edges_for_frame(frame: int, all_nodes: list[str]) -> list[tuple[str, str, float]]:
    edges = []
    
    num_active_nodes = min(10 + frame // 5, len(all_nodes))
    active_nodes = all_nodes[:num_active_nodes]
    
    if len(active_nodes) < 2:
        return edges
    
    base_edges = int(len(active_nodes) * 1.5)
    noise = random.randint(-2, 3)
    num_edges = max(1, base_edges + noise)
    
    existing_edges = set()
    
    for _ in range(num_edges):
        source = random.choice(active_nodes)
        target = random.choice(active_nodes)
        
        if source == target:
            continue
        
        edge_key = tuple(sorted([source, target]))
        if edge_key in existing_edges:
            continue
        existing_edges.add(edge_key)
        
        base_weight = random.uniform(1.0, 8.0)
        
        time_variation = 0.5 * (1 + 0.3 * math.sin(frame * 0.1))
        weight = base_weight * time_variation
        
        edges.append((source, target, round(weight, 2)))
    
    return edges

def main():
    output_path = Path(__file__).parent.parent / "data" / "sample_edges.csv"
    output_path.parent.mkdir(exist_ok=True)
    
    all_nodes = [generate_node_name(i) for i in range(NUM_NODES)]
    
    rows = []
    for frame in range(NUM_FRAMES):
        edges = generate_edges_for_frame(frame, all_nodes)
        for source, target, weight in edges:
            rows.append({
                "timestamp": frame,
                "source": source,
                "target": target,
                "weight": weight
            })
    
    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["timestamp", "source", "target", "weight"])
        writer.writeheader()
        writer.writerows(rows)
    
    print(f"Generated {NUM_FRAMES} frames with {len(rows)} total edges")
    print(f"Written to: {output_path}")

if __name__ == "__main__":
    main()

