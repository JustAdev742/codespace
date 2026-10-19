"""Fit and printability checks for the generated enclosure (pytest)."""
import itertools

import pytest
import trimesh  # noqa: F401  (used through make_enclosure.to_trimesh)

import make_enclosure as E


@pytest.fixture(scope="module")
def built():
    parts, report = E.build(write=False)
    return parts, report, E.components()


def test_every_part_is_a_valid_watertight_solid(built):
    parts, report, _ = built
    for name, man in parts.items():
        assert str(man.status()).endswith("NoError"), name
        assert man.volume() > 1000, name
        assert E.to_trimesh(man).is_watertight, name


def test_electronics_do_not_collide_with_any_printed_part(built):
    parts, _, comps = built
    for (cname, comp), (pname, part) in itertools.product(comps.items(), parts.items()):
        overlap = (comp ^ part).volume()
        assert overlap < 1.0, f"{cname} intersects {pname} by {overlap:.1f} mm^3"


def test_electronics_do_not_collide_with_each_other(built):
    _, _, comps = built
    for (a, ca), (b, cb) in itertools.combinations(comps.items(), 2):
        assert (ca ^ cb).volume() < 1e-6, f"{a} overlaps {b}"


def test_printed_parts_assemble_without_interference(built):
    parts, _, _ = built
    for a, b in itertools.combinations(parts, 2):
        overlap = (parts[a] ^ parts[b]).volume()
        assert overlap < 1.0, f"{a} and {b} overlap by {overlap:.1f} mm^3"


def test_usb_port_opening_faces_the_feather(built):
    lay = E.layout()
    fx = E.P["feather"][0]
    rear_wall_inner = -E.P["body_l"] / 2 + E.P["wall"]
    # the Feather's rear edge sits within 1 mm of the rear wall, where the USB-C opening is
    assert abs((lay["feather"][0] - fx / 2) - rear_wall_inner) <= 1.0


def test_internal_space_fits_the_parts(built):
    _, _, comps = built
    L, W, H, w = E.P["body_l"], E.P["body_w"], E.P["body_h"], E.P["wall"]
    for name in ("lipo", "feather", "tof", "jewel", "tft"):
        x0, y0, z0, x1, y1, z1 = comps[name].bounding_box()
        assert -L / 2 + w - 1e-6 <= x0 and x1 <= L / 2 - w + 1e-6, name
        assert -W / 2 + w <= y0 and y1 <= W / 2 - w, name
        assert w - 1e-6 <= z0 and z1 <= H, name


def test_handle_seats_flat_under_the_body(built):
    parts, _, _ = built
    x0, y0, z0, x1, y1, z1 = parts["handle"].bounding_box()
    assert abs(z1 - 0.0) < 1e-6          # trimmed flat at the body's underside
    assert z0 < -80                       # a full-length grip below it
