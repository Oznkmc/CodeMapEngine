import networkx as nx

class GraphBuilder:
    def __init__(self):
        # Yönlü bir graf (Directed Graph) başlatıyoruz
        self.graph = nx.DiGraph()

    def add_parsed_data(self, parsed_data: dict):
        for cls_name in parsed_data.get("classes", []):
            self.graph.add_node(cls_name, node_type="class")
        
        for func_name in parsed_data.get("functions", []):
            self.graph.add_node(func_name, node_type="function")

    def add_relationship(self, source: str, target: str, relation_type: str = "uses"):
        self.graph.add_edge(source, target, relation_type=relation_type)

    def get_affected_nodes(self, changed_node: str) -> list:
        affected = nx.ancestors(self.graph, changed_node)
        return list(affected)

    def prune_unaffected_nodes(self, changed_node: str):
        affected = self.get_affected_nodes(changed_node)
        nodes_to_keep = set(affected)
        nodes_to_keep.add(changed_node)
        
        for node in list(self.graph.nodes()):
            if node not in nodes_to_keep:
                self.graph.remove_node(node)

    def get_graph_summary(self) -> dict:
        return {
            "nodes": self.graph.number_of_nodes(),
            "edges": self.graph.number_of_edges(),
            "node_list": list(self.graph.nodes(data=True)),
            "edge_list": list(self.graph.edges(data=True))
        }